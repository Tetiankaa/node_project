import { config } from "../configs/config";
import { errorMessages } from "../constants/error-messages.constant";
import { statusCode } from "../constants/status-codes.constant";
import { EEmailType } from "../enums/email-type.enum";
import { EPostStatus } from "../enums/post-status.enum";
import { ApiError } from "../errors/api-error";
import { TimeHelper } from "../helpers/time.helper";
import { ICar } from "../interfaces/car.interface";
import { IListResponse } from "../interfaces/list-response.interface";
import { IPostBasic, IPostWithCarAndUser } from "../interfaces/post.interface";
import { IQuery } from "../interfaces/query.interface";
import { IUser } from "../interfaces/user.interface";
import { carRepository } from "../repositories/car.repository";
import { postRepository } from "../repositories/post.repository";
import { userRepository } from "../repositories/user.repository";
import { emailService } from "./email.service";
import { profanityService } from "./profanity.service";

class PostService {
  public async getAll(
    query: IQuery,
  ): Promise<IListResponse<IPostWithCarAndUser<ICar, IUser>>> {
    const posts = await postRepository.getAll(query);
    const publicPosts = await Promise.all(
      posts.data.map(async (post) => await this.fetchCarAndUserForPost(post)),
    );

    return {
      page: posts.page,
      limit: posts.limit,
      total: posts.total,
      data: publicPosts,
    };
  }
  public async getMyPosts(
    userId: string,
    query: IQuery,
  ): Promise<IListResponse<IPostWithCarAndUser<ICar, IUser>>> {
    const posts = await postRepository.getAll(query, { user_id: userId });
    const myPosts = await Promise.all(
      posts.data.map(async (post) => await this.fetchCarAndUserForPost(post)),
    );
    return {
      page: posts.page,
      limit: posts.limit,
      total: posts.total,
      data: myPosts,
    };
  }
  public async getPublicPostById(
    postId: string,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    const post = await postRepository.findOneByParams({
      _id: postId,
      isDeleted: false,
    });
    if (!post) {
      throw new ApiError(statusCode.NOT_FOUND, errorMessages.POST_NOT_FOUND);
    }
    return await this.fetchCarAndUserForPost(post);
  }
  public async getPrivatePostById(
    post: IPostBasic,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    return await this.fetchCarAndUserForPost(post);
  }
  public async deletePostById(post: IPostBasic): Promise<void> {
    if (!post.isDeleted) {
      await postRepository.findOneAndUpdate(post._id, {
        isDeleted: true,
        status: EPostStatus.NOT_ACTIVE,
      });
    }
  }
  public async deleteForeverPostById(postId: string): Promise<void> {
    await postRepository.deleteById(postId);
  }
  public async getMyArchivePosts(
    userId: string,
    query: IQuery,
  ): Promise<IListResponse<IPostWithCarAndUser<ICar, IUser>>> {
    const posts = await postRepository.getAll(
      query,
      {
        user_id: userId,
        status: EPostStatus.NOT_ACTIVE,
      },
      false,
    );
    const myPosts = await Promise.all(
      posts.data.map(async (post) => await this.fetchCarAndUserForPost(post)),
    );
    return {
      page: posts.page,
      limit: posts.limit,
      total: posts.total,
      data: myPosts,
    };
  }
  public async updatePost(
    post: IPostBasic,
    car: Partial<ICar>,
    user_id: string,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    // TODO check if currency was updated and recalculate the price
    const user = await userRepository.getById(user_id);
    const isProfanityPresent = profanityService.checkForProfanity(car);
    if (isProfanityPresent) {
      await emailService.sendByEmailType(
        EEmailType.POST_PROFANITY_DETECTED_FOR_USER,
        {
          firstName: user.firstName,
          numberOfAttempts: config.MAX_PROFANITY_EDITS,
        },
        user.email,
      );
    }
    await carRepository.updateById(post.car_id, { ...car });
    return await this.fetchCarAndUserForPost(post);
  }
  public async restorePost(
    postId: string,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    const post = await postRepository.updateById(postId, {
      isDeleted: false,
      status: EPostStatus.ACTIVE,
    });
    return await this.fetchCarAndUserForPost(post);
  }
  public async updatePostAfterProfanity(
    oldPost: IPostBasic,
    carToUpdate: Partial<ICar>,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    const isProfanityPresent = profanityService.checkForProfanity(carToUpdate);

    const updatedCar = await carRepository.updateById(oldPost.car_id, {
      ...carToUpdate,
    });
    const user = await userRepository.getById(oldPost.user_id);
    let updatedPost: IPostBasic;

    if (isProfanityPresent) {
      const sumOfProfanityEdits = oldPost.profanityEdits + 1;
      updatedPost = await postRepository.updateById(oldPost._id, {
        profanityEdits: sumOfProfanityEdits,
      });
      await emailService.sendByEmailType(
        EEmailType.POST_PROFANITY_DETECTED_FOR_USER,
        {
          firstName: user.firstName,
          numberOfAttempts: config.MAX_PROFANITY_EDITS - sumOfProfanityEdits,
        },
        user.email,
      );
      if (sumOfProfanityEdits >= config.MAX_PROFANITY_EDITS) {
        await emailService.sendByEmailType(
          EEmailType.POST_PROFANITY_DETECTED_FOR_MANAGER,
          {
            postId: oldPost._id,
            numberOfAttempts: config.MAX_PROFANITY_EDITS,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            submissionDate: TimeHelper.getCurrentDate(),
          },
          config.MANAGER_EMAIL,
        );
      }
    } else {
      updatedPost = await postRepository.updateById(oldPost._id, {
        profanityEdits: 0,
        status: EPostStatus.ACTIVE,
      });
    }
    return {
      car: updatedCar,
      user,
      _id: updatedPost._id,
      status: updatedPost.status,
      profanityEdits: updatedPost.profanityEdits,
      isDeleted: updatedPost.isDeleted,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt,
    };
  }
  public async getPostsWithProfanity(
    query: IQuery,
  ): Promise<IListResponse<IPostWithCarAndUser<ICar, IUser>>> {
    const posts = await postRepository.getAll(
      query,
      { status: EPostStatus.NOT_ACTIVE, isDeleted: false },
      false,
    );
    const postsWithInfo = await Promise.all(
      posts.data.map(async (post) => await this.fetchCarAndUserForPost(post)),
    );

    return {
      page: posts.page,
      limit: posts.limit,
      total: posts.total,
      data: postsWithInfo,
    };
  }

  private async fetchCarAndUserForPost(
    post: IPostBasic,
  ): Promise<IPostWithCarAndUser<ICar, IUser>> {
    const car = await carRepository.getById(post.car_id);
    const user = await userRepository.getById(post.user_id);

    return {
      _id: post._id,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      status: post.status,
      profanityEdits: post.profanityEdits,
      isDeleted: post.isDeleted,
      user,
      car,
    };
  }
}

export const postService = new PostService();
